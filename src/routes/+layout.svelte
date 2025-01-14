<script lang="ts">
    export const prerender = true;
    export const ssr = false; 
    import '../app.css';
    import Footer from '$lib/components/Footer.svelte';
</script>

<div class="min-h-screen flex flex-col">
    <main class="flex-grow">
        <slot />
    </main>
    <Footer />
</div>