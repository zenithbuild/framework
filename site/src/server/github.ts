export interface Contributor {
    login: string;
    avatar_url: string;
    html_url: string;
}

export async function getContributors(): Promise<Contributor[]> {
    try {
        const response = await fetch("https://api.github.com/repos/zenithbuild/framework/contributors", {
            headers: {
                "User-Agent": "Zenith-Website",
            }
        });
        
        if (!response.ok) {
            console.error("Failed to fetch contributors", response.statusText);
            return [];
        }
        
        const data = await response.json();
        return data.slice(0, 24).map((c: any) => ({
            login: c.login,
            avatar_url: c.avatar_url,
            html_url: c.html_url,
        }));
    } catch (err) {
        console.error("Error fetching contributors:", err);
        return [];
    }
}
