import type { ApiContext } from 'vike-api-router'

// DELETE /api/users/:id
export default function({ params }: ApiContext<{ id: string }>) {
  // In a real app, delete from DB here
  return null // → 204 No Content
}
