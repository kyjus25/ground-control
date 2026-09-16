export type Workspace = {
  id: string
  name: string
  path: string | null
  // Address of the machine exposing this workspace; null = local machine.
  endpoint: string | null
}
