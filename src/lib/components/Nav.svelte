<script lang="ts">
    import { page } from '$app/stores';
    import { base } from '$app/paths';
</script>

<nav class="bg-white shadow">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div class="flex h-16 justify-between">
            <div class="flex">
                <div class="flex flex-shrink-0 items-center">
                    <span class="text-lg font-semibold text-gray-900">Sample Sheet Validator</span>
                </div>
                <div class="ml-6 flex space-x-8">
                    <a
                        href={`${base}/nextseq500`}
                        class={`inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium
                        ${$page.url.pathname === `${base}/nextseq500` 
                            ? 'border-blue-500 text-gray-900'
                            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                        }`}
                    >
                        NextSeq 500/550
                    </a>
                    <a
                        href={`${base}/nextseq2k`}
                        class={`inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium
                        ${$page.url.pathname === `${base}/nextseq2k`
                            ? 'border-green-500 text-gray-900'
                            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                        }`}
                    >
                        NextSeq 1000/2000
                    </a>
                    <a
                        href={`${base}/ont`}
                        class={`inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium
                        ${$page.url.pathname === `${base}/ont`
                            ? 'border-orange-500 text-gray-900'
                            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                        }`}
                    >
                        ONT
                    </a>
                </div>
            </div>
        </div>
    </div>
</nav> 