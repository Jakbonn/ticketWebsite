export async function loginSystem() {
    const adminPanelBtn = document.getElementById('adminPanelBtn');
    const loginDialog = document.getElementById('login-dialog');
    const closeBtn = document.getElementById('closeBtn');
    const loginInput = document.getElementById('login');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('loginButton');
    const loginForm = document.getElementById('login-form');
    const adminPanelLabel = document.getElementById('adminPanelLabel');
    let isLoggedIn = false;

    if (!adminPanelBtn || !loginDialog || !loginBtn || !loginInput || !passwordInput || !closeBtn || !loginForm || !adminPanelLabel) {
        console.error("Login elements are missing from the page");
        return;
    }

    function setLoggedIn(loggedIn, user = null) {
        isLoggedIn = loggedIn;
        adminPanelLabel.textContent = loggedIn ? 'Logout' : 'Login';
        adminPanelBtn.title = loggedIn
            ? `Logged in as ${user?.full_name || user?.username || "user"}`
            : "Log in";
        window.dispatchEvent(new CustomEvent("auth-changed", {
            detail: { authenticated: loggedIn, user }
        }));
    }

    async function logOut() {
        await fetch("/logout", {
            method: "POST",
            credentials: "same-origin"
        });

        setLoggedIn(false, null);
    }

    const errorMessage = document.createElement('p');
    errorMessage.className = 'login-error';
    errorMessage.hidden = true;
    loginBtn.insertAdjacentElement('afterend', errorMessage);

    try {
        const sessionRes = await fetch("/session", { credentials: "same-origin" });
        const sessionData = await sessionRes.json();
        setLoggedIn(Boolean(sessionData.authenticated), sessionData.user);
    } catch (error) {
        console.error("Session check failed:", error);
        setLoggedIn(false);
    }

    adminPanelBtn.addEventListener('click', async () => {
        if (isLoggedIn) {
            try {
                await logOut();
            } catch (error) {
                console.error("Logout failed:", error);
                alert("Could not log out.");
            }
            return;
        }

        loginDialog.showModal();
    });

    closeBtn.addEventListener('click', () => {
        loginDialog.close();
    });

    loginForm.addEventListener('submit', event => {
        event.preventDefault();
    });

    loginBtn.addEventListener('click', async () => {
        const username = loginInput.value.trim();
        const password = passwordInput.value;

        try {
            const response = await fetch("/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                const result = await response.json().catch(() => ({}));

                if (response.status === 401) {
                    errorMessage.textContent = result.error || 'Invalid login or password';
                    errorMessage.hidden = false;
                    return;
                }

                throw new Error(result.error || `Login failed: ${response.status}`);
            }

            const result = await response.json();
            setLoggedIn(true, result.user);
            errorMessage.hidden = true;
            loginInput.value = '';
            passwordInput.value = '';
            loginDialog.close();
        } catch (error) {
            console.error("Login failed:", error);
            errorMessage.textContent = 'Could not connect to the login server';
            errorMessage.hidden = false;
        }
    });
}
