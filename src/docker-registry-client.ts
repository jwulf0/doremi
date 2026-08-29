import * as z from "zod"
import { createLogger } from "./logger.js"

const logger = createLogger("docker-registry-client")

function defaultHeaders(auth: string): Headers {
  const headers = new Headers()
  headers.set("Authorization", `Basic ${auth}`)
  headers.set("Accept", "application/json")
  return headers
}

function manifestHeaders(auth: string): Headers {
  const headers = new Headers()
  headers.set("Authorization", `Basic ${auth}`)
  headers.set(
    "Accept",
    "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json",
  )
  return headers
}

async function defaultFetch(url: string, auth: string): Promise<Response> {
  const response = await fetch(url, {
    headers: defaultHeaders(auth),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  return response
}

type RegistryConfig = {
  url: string
  auth: string
}

type RepositoryConfig = RegistryConfig & {
  repository: string
}

type ImageConfig = RepositoryConfig & {
  tag: string
}

const CatalogResponse = z.object({
  repositories: z.array(z.string()),
})
export type CatalogResponse = z.infer<typeof CatalogResponse>
export async function fetchRepositories({
  url,
  auth,
}: RegistryConfig): Promise<CatalogResponse> {
  const catalogUrl = `${url}/v2/_catalog`
  const response = await defaultFetch(catalogUrl, auth)
  const json = await response.json()
  return CatalogResponse.parse(json)
}

const TagsListResponse = z.object({
  name: z.string(),
  tags: z.array(z.string()).nullable(),
})
export type TagsListResponse = z.infer<typeof TagsListResponse>
export async function fetchTags(
  config: RepositoryConfig,
): Promise<TagsListResponse> {
  const { url, auth, repository } = config
  const tagsUrl = `${url}/v2/${repository}/tags/list`
  logger.debug(`Fetching tags for repository ${repository}: ${tagsUrl}`)
  const response = await defaultFetch(tagsUrl, auth)
  const json = await response.json()
  const parsed = TagsListResponse.parse(json)
  return parsed
}

async function fetchDigest(config: ImageConfig): Promise<string> {
  const { url, auth, repository, tag } = config
  const digestUrl = `${url}/v2/${repository}/manifests/${tag}`
  logger.debug(`Fetching digest for ${repository}: ${digestUrl}`)
  const response = await fetch(digestUrl, {
    headers: manifestHeaders(auth),
    method: "HEAD",
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const digest = response.headers.get("Docker-Content-Digest")
  if (!digest) {
    throw new Error("Docker-Content-Digest header not found")
  }
  return digest
}
//
async function deleteByDigest(
  config: ImageConfig & { digest: string },
): Promise<void> {
  const { url, auth, repository, tag, digest } = config
  const deleteUrl = `${url}/v2/${repository}/manifests/${digest}`
  logger.debug(
    `Deleting image manifest ${repository}:${tag} via digest: ${deleteUrl}`,
  )
  const response = await fetch(deleteUrl, {
    headers: defaultHeaders(auth),
    method: "DELETE",
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
}

export async function deleteByTag({
  url,
  auth,
  repository,
  tag,
}: ImageConfig): Promise<void> {
  const digest = await fetchDigest({ url, auth, repository, tag })
  await deleteByDigest({ url, auth, repository, tag, digest })
}
