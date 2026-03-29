<script lang="ts">
    import { AuthenticateWithRedirectCallback } from 'svelte-clerk';
</script>

<div class="min-h-screen flex items-center justify-center">
    <div class="text-sm text-gray-600">
        外部サービスからのログインを処理しています…
    </div>
    <!-- 処理が終わると afterSignInUrl / afterSignUpUrl にリダイレクトされます -->
    <AuthenticateWithRedirectCallback
        afterSignInUrl="/"
        afterSignUpUrl="/"
    />
</div>