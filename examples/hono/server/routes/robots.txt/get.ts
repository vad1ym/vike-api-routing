// GET /robots.txt — custom route without /api prefix
export default function() {
  return new Response('User-agent: *\nAllow: /\nDisallow: /api/', {
    headers: { 'Content-Type': 'text/plain' },
  })
}
