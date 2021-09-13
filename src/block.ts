import { classToPlain, plainToClass, Type } from 'class-transformer'
import { isMatch, startsWith } from 'lodash'
import { FileChunk } from './file-chunk'
import { Serializable } from './serializable'
import { hash } from './util'

export class Block extends Serializable {
    public readonly index: number
    public readonly previousHash: string
    @Type(() => FileChunk)
    public readonly fileChunks: FileChunk[]
    public readonly timestamp: number
    public readonly hash: string
    public readonly proof: number

    public get isValid(): boolean {
        if (isMatch(this, GENESIS_BLOCK)) return true
        return startsWith(
            Block.getProofHash(this.previousHash, this.fileChunks, this.proof),
            '00'
        )
    }

    constructor(
        index: number,
        previousHash: string,
        fileRecords: FileChunk[],
        proof: number
    ) {
        super()
        this.index = index
        this.previousHash = previousHash
        this.fileChunks = fileRecords
        this.timestamp = Date.now()
        this.proof = proof
        this.hash = Block.generateHash(this)
    }

    public static getProofHash(
        previousHash: string,
        fileChunks: FileChunk[],
        proof: number
    ): string {
        // Concatenate block contents
        const concatenated: string =
            previousHash + JSON.stringify(classToPlain(fileChunks)) + proof

        // Return hashed string
        return hash(concatenated)
    }

    public static generateHash(block: Block): string {
        // Convert the block into a string
        const stringifiedBlock = block.stringify()

        // Create a SHA256 hash of the string
        return hash(stringifiedBlock)
    }
}

// The starting block of the blockchain
export const GENESIS_BLOCK = plainToClass(Block, {
    index: 0,
    previousHash: '',
    fileChunks: [],
    timestamp: 0,
    proof: 0,
    hash: '',
})
