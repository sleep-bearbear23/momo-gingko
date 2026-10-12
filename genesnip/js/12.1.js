document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === '`') {
        toggleFullScreen();
    }
});

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        // Enter full-screen mode
        document.documentElement.requestFullscreen().catch((err) => {
            console.error(`Error attempting to enable full-screen mode: ${err.message}`);
        });
    } else {
        // Exit full-screen mode
        document.exitFullscreen().catch((err) => {
            console.error(`Error attempting to exit full-screen mode: ${err.message}`);
        });
    }
}