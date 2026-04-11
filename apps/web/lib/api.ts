const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export async function chat(message: string) {
  const res = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  })
  return res.json()
}