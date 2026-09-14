try {
    const res = await fetch("https://api.gatekeepr.io/ping", {
        method: "GET",
        headers: {
            "Authorization": "[API_KEY]",
            "Content-Type": "application/json"
        }
    })
    const json = await res.json()
    console.log(json)
} catch(err) {
    console.log(err)
}