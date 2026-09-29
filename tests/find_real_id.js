function findRealId(targetId) {
    let foundIn = [];
    const elements = document.querySelectorAll('*');
    
    elements.forEach(el => {
        // Check attributes
        Array.from(el.attributes).forEach(attr => {
            if (attr.value.includes(targetId)) {
                foundIn.push({ type: 'attribute', name: attr.name, element: el.tagName });
            }
        });
        
        // Check dataset
        Object.keys(el.dataset).forEach(key => {
            if (el.dataset[key].includes(targetId)) {
                foundIn.push({ type: 'dataset', key: key, element: el.tagName });
            }
        });
        
        // Check React fiber
        const reactKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
        if (reactKey) {
            try {
                if (JSON.stringify(el[reactKey].memoizedProps).includes(targetId)) {
                    foundIn.push({ type: 'reactProps', element: el.tagName, class: el.className });
                }
            } catch(e) {}
        }
    });
    
    return foundIn;
}
console.log(findRealId("7686713974032995578"));
