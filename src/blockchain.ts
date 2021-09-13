import { Block, GENESIS_BLOCK } from './block'
import { Serializable } from './serializable'

export class Blockchain extends Serializable {
    public chain: Block[]

    public get length(): number {
        return this.chain.length
    }

    public get lastBlock(): Block {
        return this.chain[this.chain.length - 1]
    }

    constructor() {
        super()
        this.chain = [GENESIS_BLOCK]
    }

    public isChainValid(chain?: Block[]): boolean {
        for (const block of chain ?? this.chain) {
            if (!block.isValid) {
                console.log({
                    block,
                    isValid: false,
                    hash: Block.getProofHash(
                        block.previousHash,
                        block.fileChunks,
                        block.proof
                    ),
                })

                return false
            }
        }

        return true
    }

    public replaceChain(chain: Block[]): void {
        this.chain = chain
    }

    public addBlock(block: Block): boolean {
        const chainCopy = [...this.chain]
        chainCopy.push(block)

        if (!this.isChainValid(chainCopy)) return false

        this.chain.push(block)
        return true
    }
}
