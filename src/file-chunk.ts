import { Serializable } from './serializable'

export class FileChunk extends Serializable {
    public readonly index: number
    public readonly checksum: string
    public readonly location: string
    public readonly size: number

    constructor(
        index: number,
        checksum: string,
        location: string,
        size: number
    ) {
        super()
        this.index = index
        this.checksum = checksum
        this.location = location
        this.size = size
    }
}
