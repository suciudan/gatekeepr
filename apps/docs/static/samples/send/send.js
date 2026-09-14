try {
    const res = await fetch("https://api.gatekeepr.io", {
        method: "POST",
        headers: {
            "Authorization": "[API_KEY]",
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            email: "john@gmail.com",
            ip: "0.0.0.0",
            user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0"
        })
    })
    const json = await res.json()
    console.log(json)
} catch(err) {
    console.log(err)
}