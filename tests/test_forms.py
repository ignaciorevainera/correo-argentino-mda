from playwright.sync_api import sync_playwright

def test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            print("Navigating to login...")
            page.goto('http://localhost:4321/login')
            page.wait_for_load_state('networkidle')
            print("Login page loaded.")
            page.screenshot(path='login.png', full_page=True)
            
            # Intento de login usando credenciales genéricas para ver si es posible
            print("Intento login...")
            # Llenamos los inputs refactorizados de login
            page.fill('input[name="username"]', 'admin')
            page.fill('input[name="password"]', 'admin')
            page.click('button[type="submit"]')
            page.wait_for_load_state('networkidle')
            print("Después del login.")
            page.screenshot(path='post_login.png', full_page=True)
            
        except Exception as e:
            print("Error:", e)
        finally:
            browser.close()

if __name__ == '__main__':
    test()
