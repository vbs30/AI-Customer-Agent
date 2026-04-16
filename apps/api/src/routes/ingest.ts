import { FastifyInstance } from 'fastify'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { QdrantClient } from '@qdrant/js-client-rest'
import { GoogleGenerativeAI } from '@google/generative-ai'

const COLLECTION_NAME = 'documents'
const CHUNK_SIZE = 500

// Init clients
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const qdrant = new QdrantClient({
    url: process.env.QDRANT_URL!,
    apiKey: process.env.QDRANT_API_KEY!
})

// Split text into ~500 token chunks
function chunkText(text: string, size: number = CHUNK_SIZE): string[] {
    const words = text.split(/\s+/)
    const chunks: string[] = []
    for (let i = 0; i < words.length; i += size) {
        chunks.push(words.slice(i, i + size).join(' '))
    }
    return chunks
}

// Embed a single chunk using Gemini text-embedding-004
async function embedText(text: string): Promise<number[]> {
    const model = genai.getGenerativeModel({ model: 'text-embedding-004' })
    const result = await model.embedContent(text)
    return result.embedding.values
}

// Ensure Qdrant collection exists
async function ensureCollection() {
    const collections = await qdrant.getCollections()
    const exists = collections.collections.some(c => c.name === COLLECTION_NAME)
    if (!exists) {
        await qdrant.createCollection(COLLECTION_NAME, {
            vectors: { size: 768, distance: 'Cosine' }
        })
    }
}

export async function ingestRoutes(app: FastifyInstance) {
    app.post('/ingest', async (req, reply) => {
        const { url } = req.body as { url: string }

        if (!url) {
            return reply.status(400).send({ error: 'url is required' })
        }

        try {
            // 1. Scrape the URL
            const { data: html } = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            })
            const $ = cheerio.load(html)

            // Remove scripts and styles
            $('script, style, nav, footer, header').remove()
            const text = $('body').text().replace(/\s+/g, ' ').trim()

            if (!text) {
                return reply.status(400).send({ error: 'No text found at URL' })
            }

            // 2. Chunk the text
            const chunks = chunkText(text)

            // 3. Ensure collection exists in Qdrant
            await ensureCollection()

            // 4. Embed each chunk and store in Qdrant
            const points = []
            for (let i = 0; i < chunks.length; i++) {
                const vector = await embedText(chunks[i])
                points.push({
                    id: Date.now() + i,
                    vector,
                    payload: { text: chunks[i], url, chunkIndex: i }
                })
            }

            await qdrant.upsert(COLLECTION_NAME, { points })

            return {
                success: true,
                chunksStored: chunks.length,
                url
            }

        } catch (err: any) {
            return reply.status(500).send({ error: err.message })
        }
    })
}