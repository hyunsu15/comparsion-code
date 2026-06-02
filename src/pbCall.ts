export interface pbCall {
    /**
     * call
     */
    call(link: string): Promise<string>
}