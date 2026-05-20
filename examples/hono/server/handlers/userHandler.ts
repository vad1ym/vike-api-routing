const db: Record<string, { id: string; name: string; email: string }> = {
  '1': { id: '1', name: 'Alice', email: 'alice@example.com' },
  '2': { id: '2', name: 'Bob', email: 'bob@example.com' },
}

export const userHandler = {
  async getUser(id: string) {
    const user = db[id]
    if (!user) throw new Error(`User ${id} not found`)
    return user
  },

  async listUsers() {
    return Object.values(db)
  },

  async createUser(data: { name: string; email: string }) {
    const id = String(Object.keys(db).length + 1)
    db[id] = { id, ...data }
    return db[id]
  },
}
