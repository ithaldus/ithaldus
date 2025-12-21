import app from './index'

// In development, proxy non-API requests to Vite
app.all('/*', async (c) => {
  const url = new URL(c.req.url)
  const viteUrl = `http://localhost:5173${url.pathname}${url.search}`

  try {
    const response = await fetch(viteUrl, {
      method: c.req.method,
      headers: c.req.raw.headers,
    })

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    })
  } catch {
    return c.text('Vite dev server not running', 502)
  }
})

const port = 3000

console.log(`Dev server running on http://localhost:${port}`)
console.log(`Proxying frontend to Vite on port 5173`)

export default {
  port,
  fetch: app.fetch,
}
