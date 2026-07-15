import sys
import json
import time

# We will import these inside the functions to allow fast failure/error messages if not installed
def mouse_move(x, y):
    import pyautogui
    pyautogui.moveTo(int(x), int(y), duration=0.2)
    return {"status": f"Mouse moved to {x}, {y}"}

def mouse_click(button="left"):
    import pyautogui
    pyautogui.click(button=button)
    return {"status": f"Clicked {button} mouse button"}

def mouse_drag(x, y, button="left"):
    import pyautogui
    pyautogui.dragTo(int(x), int(y), duration=0.5, button=button)
    return {"status": f"Dragged {button} mouse to {x}, {y}"}

def keyboard_type(text):
    import pyautogui
    # Pyautogui typewrite types keys one by one
    pyautogui.typewrite(text, interval=0.01)
    return {"status": f"Typed text: {text}"}

def keyboard_press(key):
    import pyautogui
    pyautogui.press(key)
    return {"status": f"Pressed key: {key}"}

def get_screen_elements():
    import pywinauto
    from pywinauto import Desktop
    import win32gui

    # Get the foreground window using win32gui
    hwnd = win32gui.GetForegroundWindow()
    if not hwnd:
        return {"error": "No foreground window found"}
    
    try:
        app = pywinauto.Application(backend="uia").connect(handle=hwnd)
        window = app.window(handle=hwnd)
    except Exception as e:
        return {"error": f"Failed to connect to foreground window: {str(e)}"}

    elements = []
    
    def traverse(ctrl):
        try:
            rect = ctrl.rectangle()
            # Only include elements that have a valid rectangle and are visible
            if rect.width() > 0 and rect.height() > 0 and ctrl.is_visible():
                text = ctrl.window_text()
                control_type = ctrl.element_info.control_type
                
                # We only want actionable or readable elements to avoid clutter
                if control_type in ['Button', 'MenuItem', 'Edit', 'CheckBox', 'RadioButton', 'TabItem', 'ListItem', 'Document', 'Hyperlink']:
                    elements.append({
                        "type": control_type,
                        "text": text,
                        "x": rect.mid_point().x,
                        "y": rect.mid_point().y,
                        "width": rect.width(),
                        "height": rect.height()
                    })
            
            for child in ctrl.children():
                traverse(child)
        except Exception:
            pass
            
    traverse(window)
    return {"elements": elements}

if __name__ == "__main__":
    try:
        input_data = sys.stdin.read()
        if not input_data:
            print(json.dumps({"error": "No input provided"}))
            sys.exit(1)
            
        req = json.loads(input_data)
        action = req.get("action")
        
        if action == "mouse_move":
            result = mouse_move(req.get("x"), req.get("y"))
        elif action == "mouse_click":
            result = mouse_click(req.get("button", "left"))
        elif action == "mouse_drag":
            result = mouse_drag(req.get("x"), req.get("y"), req.get("button", "left"))
        elif action == "keyboard_type":
            result = keyboard_type(req.get("text", ""))
        elif action == "keyboard_press":
            result = keyboard_press(req.get("key"))
        elif action == "get_screen_elements":
            result = get_screen_elements()
        else:
            result = {"error": f"Unknown action: {action}"}
            
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
