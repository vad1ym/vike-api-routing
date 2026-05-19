// RPC handler — can be called from client like a regular function
// Registers as POST /_rpc/userHandler/<fnName>

const db: Record<string, { id: string; name: string; email: string }> = {
  '1': { id: '1', name: 'Alice', email: 'alice@example.com' },
  '2': { id: '2', name: 'Bob', email: 'bob@example.com' },
}

export async function getUser(id: string) {
  const user = db[id]
  if (!user) throw new Error(`User ${id} not found`)
  return user
}

export async function listUsers() {
  return Object.values(db)
}

export async function createUser(data: { name: string; email: string }) {
  const id = String(Object.keys(db).length + 1)
  db[id] = { id, ...data }
  return db[id]
}
