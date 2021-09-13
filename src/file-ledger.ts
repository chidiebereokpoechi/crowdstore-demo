import { remove } from 'lodash'
import { v4 } from 'uuid'
import { FileChunk } from './file-chunk'

export interface LedgerEntry {
    id: string // Unique ID for ledger entry
    name: string // The name of the file before upload
    size: number // Size of the file
    chunks: FileChunk[] // Pieces of the file
    checksum: string // SHA256 hash of file for verification of integrity
}

export class FileLedger {
    public entries: LedgerEntry[]

    constructor() {
        this.entries = []
    }

    public addEntry(
        name: string,
        chunks: FileChunk[],
        size: number,
        checksum: string
    ) {
        const entry: LedgerEntry = {
            id: v4(),
            name,
            size,
            chunks,
            checksum,
        }

        this.entries.push(entry)
    }

    public replaceLedger(entries: LedgerEntry[]): void {
        this.entries = entries
    }

    public removeEntry(id: string) {
        return remove(this.entries, { id })[0]
    }
}
