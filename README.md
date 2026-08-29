# Do Re Mi

**Do**cker **Re**gistry Cleaning - (Do Re Mi because of the musical thing)

Node JS (dockerized) utility for cleaning a docker registry that uses [semver](https://semver.org/) tags. For both automated and interactive CLI usage.

## Usage

Run the local CLI directly from this checkout:

```sh
node --import tsx src/index.ts --help
```

This runs the current TypeScript source using the project's local `tsx` dependency.

## Docker

Use the pre-built docker image [https://hub.docker.com/r/jwulf0/doremi](https://hub.docker.com/r/jwulf0/doremi) or build the image from this checkout:

```sh
docker build --tag doremi:local .
docker run --rm doremi:local --help
```

For non-interactive use, either provide credentials via the `--username` and `--password` options or place the base64-encoded Docker Registry credentials in a file, e.g. (using a named volume):

```sh
docker run --rm --interactive --tty \
 -v doremi-auth:/secrets \
 busybox:1.36 \
 sh -c 'read -p "Username: " username; read -s -p "Password: " password; printf "\n"; printf "%s:%s" "$username" "$password" | base64 > /secrets/registry-auth'

docker run --rm \
 -v doremi-auth:/run/secrets:ro \
 doremi:local \
 --registry-url https://registry.example.com \
 --auth-file /run/secrets/registry-auth \
 --delete \
 --keep-versions 10
```
