<script setup lang="ts">
import { ref } from 'vue'
import { userHandler } from 'vike-api-router/handlers'

const results = ref<Record<string, string>>({})
const rpcResult = ref<unknown>(null)

async function listUsers() { rpcResult.value = await userHandler.listUsers() }
async function getUser(id: string) { rpcResult.value = await userHandler.getUser(id) }

async function fetchAndShow(id: string, url: string, method = 'GET', headers: Record<string, string> = {}) {
  const res = await fetch(url, { method, headers })
  const text = await res.text()
  let body: string
  try { body = JSON.stringify(JSON.parse(text), null, 2) } catch { body = text }
  results.value[id] = `${res.status} ${res.statusText}\n${body}`
}
</script>

<template>
  <div style="font-family: sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px">
    <h1>vike-api-router</h1>
    <p>Open DevTools → Network to see the requests.</p>

    <h2>GET /api</h2>
    <button @click="fetchAndShow('root', '/api')">Fetch /api</button>
    <pre>{{ results['root'] }}</pre>

    <h2>GET /api/health (any method via +all.ts)</h2>
    <button @click="fetchAndShow('health', '/api/health')">GET</button>
    <button @click="fetchAndShow('health', '/api/health', 'POST')">POST</button>
    <pre>{{ results['health'] }}</pre>

    <h2>GET /api/users (requires x-api-key)</h2>
    <button @click="fetchAndShow('users', '/api/users', 'GET', { 'x-api-key': 'secret' })">With key</button>
    <button @click="fetchAndShow('users', '/api/users')">Without key (401)</button>
    <pre>{{ results['users'] }}</pre>

    <h2>GET /api/users/:id</h2>
    <button @click="fetchAndShow('user', '/api/users/1', 'GET', { 'x-api-key': 'secret' })">User 1</button>
    <button @click="fetchAndShow('user', '/api/users/999', 'GET', { 'x-api-key': 'secret' })">User 999 (404)</button>
    <pre>{{ results['user'] }}</pre>

    <h2>GET /robots.txt</h2>
    <button @click="fetchAndShow('robots', '/robots.txt')">Fetch</button>
    <pre>{{ results['robots'] }}</pre>

    <h2>RPC handlers</h2>
    <button @click="listUsers()">listUsers()</button>
    <button @click="getUser('1')">getUser('1')</button>
    <pre>{{ JSON.stringify(rpcResult, null, 2) }}</pre>
  </div>
</template>
