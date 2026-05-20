import type { ApiContext } from 'vike-api-router'

// GET /api/users/:id
const users: Record<string, { id: string; name: string }> = {
  '1': { id: '1', name: 'Alice' },
  '2': { id: '2', name: 'Bob' },
}

export default function({ params }: ApiContext<{ id: string }>) {
  const user = users[params.id]
  if (!user) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return user
}
