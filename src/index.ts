import { option, constant } from "@optique/core/primitives"
import { object, or, merge } from "@optique/core/constructs"
import { string, integer } from "@optique/core/valueparser"
import { run } from "@optique/run"
import { input, password } from "@inquirer/prompts"
import { readFileSync } from "fs"
import {
  deleteByTag,
  fetchRepositories,
  fetchTags,
} from "./docker-registry-client.js"
import { rsort, valid } from "semver"
import { message } from "@optique/core/message"

const registryOptions = object({
  registryUrl: option("-r", "--registry-url", string(), {
    description: message`URL of the Docker registry`
  }),
})

const authOptionPrompt = object({
  authMode: constant("prompt" as const),
  promptForAuth: option("-o", "--prompt-for-auth", {
    description: message`Prompt for Docker registry authentication`
  }),
})

const authOptionUserPass = object({
  authMode: constant("userpass" as const),
  username: option("-u", "--username", string(), {
    description: message`Docker registry username`
  }),
  password: option("-p", "--password", string(), {
    description: message`Docker registry password`
  }),
})

const authOptionFile = object({
  authMode: constant("file" as const),
  authFile: option("-a", "--auth-file", string(), {
    description: message`Path to Docker registry authentication file. Needs to contain the base64-encoded credentials <username>:<password></username>`
  }),
})

const deleteImageVersions = object({
  deleteVersions: option("-d", "--delete", {
    description: message`Delete outdated image versions; otherwise, it's a dry run listing images that would be deleted.`
  }),
  keepVersions: option(
    "-k",
    "--keep-versions",
    integer({ min: 2 }),
    {
      description: message`Delete outdated image versions, keeping the latest n versions. Note that in general, only semver-tags are considered for deletion; any others are ignored. Needs to be >= 2.`
    }
  ).withDefault(5),
})

const parser = merge(
  registryOptions,
  or(authOptionPrompt, authOptionUserPass, authOptionFile),
  deleteImageVersions,
)

const config = run(parser, {
  programName: "doremi",
  brief: message`Cleanup outdated images from docker registry`,
  help: "both",
})

const getAuthBase64 = async () => {
  switch (config.authMode) {
    case "prompt":
      const username = await input({ message: "Docker Registry Username:" })
      const userPassword = await password({
        message: "Docker Registry Password:",
      })
      return Buffer.from(`${username}:${userPassword}`).toString("base64")
    case "userpass":
      return Buffer.from(`${config.username}:${config.password}`).toString(
        "base64",
      )
    case "file":
      return readFileSync(config.authFile, "utf-8").trim()
  }
}

const authBase64: string = await getAuthBase64()

const registryConfig = {
  url: config.registryUrl,
  auth: authBase64,
}
const repositories = await fetchRepositories(registryConfig)

console.log("repos response: ", repositories)

for (const repository of repositories.repositories) {
  const tags = await fetchTags({
    url: config.registryUrl,
    auth: authBase64,
    repository,
  })
  console.log(
    `Repository: ${repository}, Tags: ${(tags.tags || []).join(", ")}`,
  )

  if (!config.deleteVersions) {
    continue
  }

  // we only look at semver-formatted tags
  // filter for semver tags, then sort them in descending order, skip the latest n ones and delete the rest
  const nonLatest = (tags.tags || []).filter((it) => it !== "latest")
  const invalid = nonLatest.filter((it: string) => valid(it) === null)
  const nonLatestValid = nonLatest.filter((it: string) => valid(it) !== null)

  if (invalid.length > 0) {
    console.log(`Ignoring ${invalid.length} non-semver tags.`)
  }

  const sorted = rsort(nonLatestValid)
  const toDelete = sorted.slice(config.keepVersions)

  if (!config.deleteVersions) {
    console.log(`Would delete ${toDelete.length} tags of ${repository}: ${toDelete.join(", ")}`)
    continue
  }

  console.log(`Deleting ${toDelete.length} tags of ${repository}: ${toDelete.join(", ")}`)

  for (const tag of toDelete) {
    console.log(`Deleting ${repository}:${tag}`)
    await deleteByTag({
      url: config.registryUrl,
      auth: authBase64,
      repository,
      tag,
    })
  }
}
