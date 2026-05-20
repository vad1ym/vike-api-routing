import type { ApiContext } from 'vike-api-router'

// POST /api/users
export default async function({ req }: ApiContext) {
  const body = await req.json() as { name: string }
  // In a real app, save to DB here
  return new Response(JSON.stringify({ id: '3', name: body.name }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  })
}
