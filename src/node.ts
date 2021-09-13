import { classToPlain, plainToClass } from 'class-transformer'
import * as fs from 'fs'
import { sampleSize, startsWith } from 'lodash'
import * as path from 'path'
import { v4 } from 'uuid'
import { Block } from './block'
import { Blockchain } from './blockchain'
import {
    CHAIN_LOCATION,
    DATA_LOCATION,
    DOWNLOAD_LOCATION,
    FILES_LOCATION,
    FILE_LEDGER_LOCATION,
    ID_LOCATION,
    KEYS_LOCATION,
    MAX_CHUNK_SIZE,
    PEERS_LOCATION,
} from './constants'
import { FileChunk } from './file-chunk'
import { FileLedger, LedgerEntry } from './file-ledger'
import { Identity, Keys } from './identity'
import { Requester } from './requester'
import { hash } from './util'

interface FileUploadChunk {
    checksum: string
    actualSize: number
    newSize: number
}

interface FileUpload {
    fileName: string
    size: number
    checksum: string
    chunks: FileUploadChunk[]
}

export class Node {
    public readonly blockchain: Blockchain
    public readonly identity: Identity
    public peers: Record<string, string>
    public fileUploads: FileUpload[]
    public fileLedger: FileLedger
    public id!: string

    public get peerIds(): string[] {
        return Object.keys(this.peers)
    }

    public get peerCount(): number {
        return this.peerIds.length
    }

    constructor() {
        this.blockchain = new Blockchain()
        this.identity = new Identity()
        this.fileLedger = new FileLedger()
        this.peers = {}
        this.fileUploads = []

        this.setUpFolders()
        this.setUpId()
        this.setUpKeys()
        this.loadPeers()
        this.loadFileLedger()
        this.loadBlockchain()
    }

    public async announce(port: string | number) {
        try {
            const peers = await Requester.announceNode(this.id, port)
            peers.forEach((peer) => this.addPeer(peer))
        } catch (e) {
            console.log('An error occured during announcement')
            console.log((e as Error).message)
        }
    }

    public addPeer(peer: { id: string; address: string }): void {
        if (peer.id === this.id) return

        // Object.keys(this.peers).forEach((id) => {
        //     if (peer.id === id) return
        //     console.log(
        //         'Broadcasting to %s, peer %s at %s',
        //         id,
        //         peer.id,
        //         peer.address
        //     )

        //     Requester.broadcastPeer(this.peers[id], peer)
        // })

        this.peers[peer.id] = peer.address
        this.savePeers()
    }

    public removePeer(peerId: string): void {
        delete this.peers[peerId]
        this.savePeers()
    }

    public setUpFolders(): void {
        if (!fs.existsSync(DATA_LOCATION)) {
            fs.mkdirSync(DATA_LOCATION)
        }

        if (!fs.existsSync(FILES_LOCATION)) {
            fs.mkdirSync(FILES_LOCATION)
        }

        if (!fs.existsSync(DOWNLOAD_LOCATION)) {
            fs.mkdirSync(DOWNLOAD_LOCATION)
        }
    }

    public setUpId(): void {
        if (fs.existsSync(ID_LOCATION)) {
            try {
                this.id = fs.readFileSync(ID_LOCATION, { encoding: 'utf-8' })
            } catch (e) {
                if (e instanceof Error) console.error(e.message)
                console.info(`There was an issue loading the id.`)
            }

            return
        }

        this.id = v4()
        fs.writeFileSync(ID_LOCATION, this.id, 'utf-8')
    }

    public setUpKeys(): void {
        if (fs.existsSync(KEYS_LOCATION)) {
            try {
                const keys: Keys = JSON.parse(
                    fs.readFileSync(KEYS_LOCATION, { encoding: 'utf-8' })
                )

                this.identity.importKeys(keys)
            } catch (e) {
                if (e instanceof Error) console.error(e.message)
                console.info(`There was an issue loading the keys.`)
            }

            return
        }

        this.identity.generateKeys()
        this.saveKeys()
    }

    public saveKeys(): void {
        try {
            const stringified = JSON.stringify(
                this.identity.exportKeys(),
                undefined,
                4
            )

            fs.writeFileSync(KEYS_LOCATION, stringified, { encoding: 'utf-8' })
        } catch (e) {
            if (e instanceof Error) console.error(e.message)
            console.info(
                `There was an issue saving the keys to [${KEYS_LOCATION}].`
            )
        }
    }

    public loadPeers(): void {
        if (fs.existsSync(PEERS_LOCATION)) {
            try {
                const peers: Node['peers'] = JSON.parse(
                    fs.readFileSync(PEERS_LOCATION, { encoding: 'utf-8' })
                )

                this.peers = peers
                Requester.pingPeers(peers, this)
            } catch (e) {
                if (e instanceof Error) console.error(e.message)
                console.info(`There was an issue loading the peers.`)
            }

            return
        }
    }

    public savePeers(): void {
        try {
            const stringified = JSON.stringify(this.peers, undefined, 4)

            fs.writeFileSync(PEERS_LOCATION, stringified, { encoding: 'utf-8' })
        } catch (e) {
            if (e instanceof Error) console.error(e.message)
            console.info(
                `There was an issue saving the peers to [${PEERS_LOCATION}].`
            )
        }
    }

    public saveBlockchain(): void {
        try {
            const stringified = JSON.stringify(
                classToPlain(this.blockchain.chain),
                undefined,
                4
            )

            fs.writeFileSync(CHAIN_LOCATION, stringified, {
                encoding: 'utf-8',
            })
        } catch (e) {
            if (e instanceof Error) console.error(e.message)
            console.info(`Could not save chain to [${CHAIN_LOCATION}].`)
        }
    }

    public addLedgerEntry(
        name: string,
        size: number,
        chunks: FileChunk[],
        checksum: string
    ): void {
        this.fileLedger.addEntry(name, chunks, size, checksum)
        this.saveFileLedger()
    }

    public saveFileLedger(): void {
        try {
            const stringified = JSON.stringify(
                classToPlain(this.fileLedger.entries),
                undefined,
                4
            )

            fs.writeFileSync(FILE_LEDGER_LOCATION, stringified, {
                encoding: 'utf-8',
            })
        } catch (e) {
            if (e instanceof Error) console.error(e.message)
            console.info(`Could not save ledger to [${FILE_LEDGER_LOCATION}].`)
        }
    }

    public loadBlockchain(): void {
        if (fs.existsSync(CHAIN_LOCATION)) {
            try {
                const stringified = fs.readFileSync(CHAIN_LOCATION, {
                    encoding: 'utf-8',
                })

                const chain = plainToClass(Block, JSON.parse(stringified))
                this.blockchain.replaceChain(chain)
            } catch (e) {
                if (e instanceof Error) console.error(e.message)
                console.info(
                    `Could not load chain at [${CHAIN_LOCATION}]. Using default chain`
                )
            }
        }
    }

    public loadFileLedger(): void {
        if (fs.existsSync(FILE_LEDGER_LOCATION)) {
            try {
                const stringified = fs.readFileSync(FILE_LEDGER_LOCATION, {
                    encoding: 'utf-8',
                })

                const entries: LedgerEntry[] = JSON.parse(stringified)
                this.fileLedger.replaceLedger(entries)
            } catch (e) {
                if (e instanceof Error) console.error(e.message)
                console.info(
                    `Could not load ledger at [${FILE_LEDGER_LOCATION}]. Using default chain`
                )
            }
        }
    }

    public createFileUpload(filePath: string): void {
        const fileName = path.basename(filePath)
        const stats = fs.statSync(filePath)
        const fd = fs.openSync(path.resolve(filePath), 'r')
        const size = stats.size
        const chunkCount = Math.ceil(size / MAX_CHUNK_SIZE)
        const fileBuffer = Buffer.allocUnsafe(size)

        fs.readSync(fd, fileBuffer, 0, size, 0)
        const checksum = hash(fileBuffer)
        const chunks: FileUploadChunk[] = []

        console.time('chunking')

        for (let i = 0; i < chunkCount; ++i) {
            // Calculate the size for each chunk
            const chunkActualSize =
                i === chunkCount - 1 ? size % MAX_CHUNK_SIZE : MAX_CHUNK_SIZE

            // Create a buffer of maximum chunk size to store each chunk (last one gets padded)
            const buffer = Buffer.allocUnsafe(MAX_CHUNK_SIZE)

            // Read into chunk buffer
            fs.readSync(fd, buffer, 0, MAX_CHUNK_SIZE, i * MAX_CHUNK_SIZE)

            // Calculate the checksum of the chunk
            const chunkChecksum = hash(buffer)

            // Encrypt the chunk buffer
            const encryptedBuffer = this.identity.encrypt(buffer)

            // Write the chunk to disk using the checksum as name
            const fd2 = fs.openSync(FILES_LOCATION + '/' + chunkChecksum, 'w')
            const newSize = fs.writeSync(fd2, encryptedBuffer)

            // Add chunk to chunks
            chunks.push({
                actualSize: chunkActualSize,
                checksum: chunkChecksum,
                newSize,
            })
        }

        console.timeEnd('chunking')

        const fileUpload: FileUpload = {
            size,
            checksum,
            chunks,
            fileName,
        }

        this.fileUploads.push(fileUpload)
    }

    public async uploadFile() {
        if (this.fileUploads.length === 0) {
            throw new Error('No files to upload')
        }

        const fileUpload = this.fileUploads[this.fileUploads.length - 1]

        if (this.peerCount === 0) {
            throw new Error('No peers to upload to')
        }

        const chunkCount = fileUpload.chunks.length
        const selectedPeers = sampleSize(
            this.peerIds,
            this.peerCount > 3 ? 3 : this.peerCount
        )

        const uploads: Promise<any>[] = []
        const fileChunks: FileChunk[] = []

        for (let i = 0; i < chunkCount; ++i) {
            const chunk = fileUpload.chunks[i]
            const peerIndex = i % selectedPeers.length
            const peerAddress = this.peers[selectedPeers[peerIndex]]
            const stream = fs.createReadStream(
                FILES_LOCATION + '/' + chunk.checksum
            )

            const upload = Requester.uploadFile(
                peerAddress,
                stream,
                chunk.checksum
            )

            const fileChunk = new FileChunk(
                i,
                chunk.checksum,
                selectedPeers[peerIndex],
                chunk.newSize
            )

            uploads.push(upload)
            fileChunks.push(fileChunk)
        }

        let promiseValue: Promise<any>

        try {
            await Promise.all(uploads)
            const previousBlock = this.blockchain.lastBlock

            const block = new Block(
                previousBlock.index + 1,
                previousBlock.hash,
                fileChunks,
                this.calculateProof(previousBlock.hash, fileChunks)
            )

            if (await this.addBlock(block)) {
                this.addLedgerEntry(
                    fileUpload.fileName,
                    fileUpload.size,
                    fileChunks,
                    fileUpload.checksum
                )

                await Promise.all(
                    this.peerIds.map((id) =>
                        Requester.broadcastBlock(this.peers[id], block)
                    )
                )
            }

            promiseValue = Promise.resolve('Files successfully created')
        } catch (e) {
            console.log(e)
            promiseValue = Promise.reject('Error uploading files, rolling back')
        }

        try {
            for (const chunk of fileChunks) {
                console.log(
                    'Attempting to remove file [%s]',
                    FILES_LOCATION + '/' + chunk.checksum
                )
                fs.rmSync(FILES_LOCATION + '/' + chunk.checksum)
                console.log(
                    'Removed file [%s]',
                    FILES_LOCATION + '/' + chunk.checksum
                )
            }
        } catch (e) {
            console.log(e)
        }

        this.fileUploads.pop()
        return promiseValue
    }

    public calculateProof(
        previousHash: string,
        fileChunks: FileChunk[]
    ): number {
        let proof = 0

        while (true) {
            const valid = startsWith(
                Block.getProofHash(previousHash, fileChunks, proof),
                '00'
            )

            if (valid) {
                console.log('Completed in %d tries', proof + 1)
                return proof
            }

            ++proof
        }
    }

    public async addBlock(block: Block): Promise<boolean> {
        const accepted = this.blockchain.addBlock(block)

        if (accepted) {
            this.saveBlockchain()
            return true
        }

        const chains = await Promise.all(
            this.peerIds.map((id) => Requester.getBlocks(this.peers[id]))
        )

        let longestValidChain: Block[] | null = null

        for (const chain of chains) {
            if (!this.blockchain.isChainValid(chain)) continue

            if (
                (longestValidChain &&
                    chain.length > longestValidChain.length) ||
                chain.length > this.blockchain.length
            ) {
                longestValidChain = chain
            }
        }

        if (
            longestValidChain &&
            longestValidChain.length > this.blockchain.length
        ) {
            this.blockchain.replaceChain(longestValidChain)
        }

        return accepted
    }

    public async renameFile(filePath: string, newName: string) {
        const fileName = path.basename(filePath)
        fs.renameSync(
            FILES_LOCATION + '/' + fileName,
            FILES_LOCATION + '/' + newName
        )
    }

    public async deleteFile(filePath: string) {
        if (fs.existsSync(filePath)) fs.rmSync(filePath)
    }

    public canDownloadFile(index: number): boolean {
        if (index >= this.fileLedger.entries.length) {
            return false
        }

        const { chunks } = this.fileLedger.entries[index]
        return chunks.every(({ location: id }) => {
            return !!this.peers[id]
        })
    }

    public async download(index: number): Promise<string> {
        if (!this.canDownloadFile(index)) {
            throw new Error('The file cannot be downloaded')
        }

        const { name, size, chunks } = this.fileLedger.entries[index]

        await Promise.all(
            chunks.map(({ location: id, checksum }) => {
                const writeStream = fs.createWriteStream(
                    DOWNLOAD_LOCATION + '/' + checksum
                )
                return Requester.downloadFile(
                    this.peers[id],
                    checksum,
                    writeStream
                )
            })
        )

        const decryptedFileBuffer = Buffer.allocUnsafe(size)

        for (let i = 0; i < chunks.length; ++i) {
            // Get current chunk information
            const { size, checksum: chunkChecksum } = chunks[i]

            // Create buffer for chunk
            const buffer = Buffer.allocUnsafe(size)

            // Load chunk contents into buffer
            const fd3 = fs.openSync(
                DOWNLOAD_LOCATION + '/' + chunkChecksum,
                'r'
            )

            fs.readSync(fd3, buffer, 0, size, 0)

            // Decrypt the chunk contents
            const decryptedBuffer = this.identity.decrypt(buffer)

            // Assemble decrypted chunks
            decryptedBuffer.copy(decryptedFileBuffer, i * MAX_CHUNK_SIZE)
        }

        const filePath = DOWNLOAD_LOCATION + '/' + name

        // Store decrypted chunks to file
        const fd4 = fs.openSync(filePath, 'w')
        fs.writeSync(fd4, decryptedFileBuffer)

        return filePath
    }
}
