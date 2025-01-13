<script lang="ts">
    import { reverseComplement } from '$lib/utils';
    
    export let headers: string[] = [];
    export let rows: string[][] = [];

    const index2ColIndex = headers.findIndex(header => 
        header.toLowerCase().replace(/[_\s]/g, '') === 'index2'
    );

    function getTooltip(value: string): string {
        return `${reverseComplement(value)}`;
    }
</script>

<div class="rounded-lg border border-gray-200">
    <div class="overflow-x-auto">
        <div class="max-h-[600px] overflow-y-auto">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50 sticky top-0">
                    <tr>
                        {#each headers as header}
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                                {header}
                            </th>
                        {/each}
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    {#each rows as row}
                        <tr class="hover:bg-gray-50">
                            {#each row as cell, cellIndex}
                                <td class="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                                    {#if cellIndex === index2ColIndex && cell}
                                        <div class="tooltip-container">
                                            <span class="cursor-help border-b border-dotted border-gray-400">
                                                {cell}
                                            </span>
                                            <div class="tooltip-content">
                                                {getTooltip(cell)}
                                            </div>
                                        </div>
                                    {:else}
                                        {cell}
                                    {/if}
                                </td>
                            {/each}
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </div>
</div>

<style>
    .tooltip-container {
        position: relative;
        display: inline-block;
    }

    .tooltip-content {
        visibility: hidden;
        position: absolute;
        bottom: 100%;
        left: 0;
        transform: translateY(-4px);
        background-color: #1f2937;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
        z-index: 10;
        opacity: 0;
        transition: opacity 0.2s, visibility 0.2s;
    }

    .tooltip-container:hover .tooltip-content {
        visibility: visible;
        opacity: 1;
    }

    /* Add a small triangle pointer */
    .tooltip-content::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 10px;
        border-width: 4px;
        border-style: solid;
        border-color: #1f2937 transparent transparent transparent;
    }
</style> 