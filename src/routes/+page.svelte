<script lang="ts">
    import { onMount } from 'svelte';
    import { base } from '$app/paths';
    onMount(() => {
        window.location.href = `${base}/nextseq500`;
    });
</script>

<svelte:head>
    <meta http-equiv="refresh" content={`0;url=${base}/nextseq2k`}>
</svelte:head>

<div class="flex items-center justify-center min-h-screen">
    <p class="text-gray-500">Redirecting...</p>
</div>