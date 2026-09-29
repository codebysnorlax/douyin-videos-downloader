function findVideoUrlsInReact() {
    const video = document.querySelector('video');
    if (!video) return "No video found";
    
    // Find the React internal key
    const reactKey = Object.keys(video).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
    if (!reactKey) return "No React key found";
    
    let fiber = video[reactKey];
    let foundUrls = new Set();
    
    // Traverse up the React Fiber tree
    for (let i = 0; i < 50 && fiber; i++) {
        try {
            const props = fiber.memoizedProps;
            const state = fiber.memoizedState;
            
            // Convert to string and regex search for CDN domains
            const propStr = JSON.stringify(props);
            const stateStr = JSON.stringify(state);
            
            const urlRegex = /https?:\/\/[^\s"']+(douyinvod\.com|ixigua\.com)[^\s"']+/g;
            
            if (propStr) {
                let matches = propStr.match(urlRegex);
                if (matches) matches.forEach(m => foundUrls.add(m));
            }
            if (stateStr) {
                let matches = stateStr.match(urlRegex);
                if (matches) matches.forEach(m => foundUrls.add(m));
            }
        } catch(e) {}
        fiber = fiber.return;
    }
    
    return Array.from(foundUrls);
}
console.log(findVideoUrlsInReact());
