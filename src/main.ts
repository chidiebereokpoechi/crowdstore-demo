import * as bodyParser from 'body-parser'
import { plainToClass } from 'class-transformer'
import * as cors from 'cors'
import * as express from 'express'
import * as formidable from 'express-formidable'
import * as ip from 'ip'
import * as path from 'path'
import 'reflect-metadata'
import { Block } from './block'
import { FILES_LOCATION } from './constants'
import { Node } from './node'

const port = process.env.PORT ?? 8090
const node = new Node()

const app = express()
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.use(cors())
app.use(express.static('public'))

app.get('/ping', (_, response) => {
    response.json({ message: 'PING!' })
})

app.get('/id', (_, response) => {
    response.json({ data: node.id })
})

app.get('/peers', (_, response) => {
    response.json({ data: node.peers })
})

app.post('/peers', (request, response) => {
    const body: {
        id: string
        address: string
    } = request.body

    node.addPeer(body)
    console.log('Adding a peer', body)
    response.json({ message: `Peer [${body.id}] at [${body.address}] added` })
})

app.delete('/peers/:id', (request, response) => {
    const id: string = request.params.id
    node.removePeer(id)
    return response.json({ message: `Peer [${id}] was removed` })
})

app.get('/blocks', (_, response) => {
    response.json({ data: node.blockchain.serialize() })
})

app.post('/blocks', async (request, response) => {
    let block: Block = request.body
    block = plainToClass(Block, block)
    const accepted = await node.addBlock(block)

    response.json({
        message: accepted
            ? 'New block was successfully added'
            : 'Block was rejected',
    })
})

app.post(
    '/file',
    formidable({
        uploadDir: 'files',
        multiples: false,
    }),
    (request, response) => {
        const file = request.files!.chunk as any
        node.renameFile(file.path, file.name)

        response.json({
            message: `Chunk [${file.name}] saved successfully`,
        })
    }
)

app.get('/ledger', (_, response) => {
    return response.json({ data: node.fileLedger })
})

app.get('/file/:hash', (request, response) => {
    const fileHash = request.params.hash
    const filePath = path.resolve(FILES_LOCATION + '/' + fileHash)
    response.sendFile(filePath)
})

app.get('/download/:index', async (request, response) => {
    const index = +request.params.index
    response.sendFile(path.resolve(await node.download(index)))
})

app.post(
    '/upload',
    formidable({
        uploadDir: 'files',
        multiples: false,
    }),
    async (request, response) => {
        const file = request.files!.file as any

        try {
            node.renameFile(file.path, file.name)
            const path = FILES_LOCATION + '/' + file.name

            if (node.peerCount === 0) {
                node.deleteFile(path)
                return response
                    .json({
                        error: 'There are no peers to upload to',
                    })
                    .status(422)
            }

            node.createFileUpload(path)

            console.log('finished')

            try {
                try {
                    await node.uploadFile()
                    node.deleteFile(path)
                    response
                        .json({ message: 'File uploaded successfully' })
                        .status(201)
                } catch (e) {
                    console.error(e)
                    return response
                        .json({
                            error: 'There was an error uploading the file',
                        })
                        .status(422)
                }
            } catch (e) {
                console.error(e)
                return response
                    .json({
                        error: 'There was an error uploading the file',
                    })
                    .status(422)
            }
        } catch (e) {
            console.error(e)
            return response
                .json({
                    error: 'There was an error uploading the file',
                })
                .status(422)
        }
    }
)

app.post('/test-upload', async (_, response) => {
    if (node.peerCount === 0) {
        return response.json({ error: 'There are no peers to upload to' })
    }

    node.createFileUpload('test/Dockerfile')

    try {
        try {
            await node.uploadFile()
            response.json({ message: 'File uploaded successfully' })
        } catch (e) {
            console.error(e)
            return response.json({
                error: 'There was an error uploading the file',
            })
        }
    } catch (e) {
        console.error(e)
        return response.json({ error: 'There was an error uploading the file' })
    }
})

app.listen(port, () => {
    console.log('App is listening on port %s at %s', port, ip.address('Wi-Fi'))
    node.announce(port)
})
