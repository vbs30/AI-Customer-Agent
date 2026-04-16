import 'dotenv/config'
import Fastify from 'fastify'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { ingestRoutes } from './routes/ingest'

const app = Fastify({ logger: true })
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash' })

app.get('/health', async () => ({ status: 'ok' }))

app.post('/chat', async (req) => {
  const { message } = req.body as { message: string }
  const result = await model.generateContent(message)
  return { reply: result.response.text() }
})

app.register(ingestRoutes)

app.listen({ port: Number(process.env.PORT) || 3001, host: '0.0.0.0' })