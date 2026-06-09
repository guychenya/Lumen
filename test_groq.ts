const test = async () => {
    try {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { 'Authorization': 'Bearer test' }
        });
        console.log(await res.text());
    } catch (e) {
        console.error(e);
    }
};
test();
