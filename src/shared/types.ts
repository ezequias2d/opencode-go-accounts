export type GoAccount = {
  id: string
  name: string
  key: string
  createdAt: number
}

export type GoStore = {
  version: 1
  active: string | null
  accounts: GoAccount[]
}
