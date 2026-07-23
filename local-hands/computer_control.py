import sys
import os
import json
import time

# We will import these inside the functions to allow fast failure/error messages if not installed
def mouse_move(x, y):
    import pyautogui
    pyautogui.FAILSAFE = False
    pyautogui.moveTo(int(x), int(y), duration=0.2)
    return {"status": f"Mouse moved to {x}, {y}"}

def mouse_click(button="left"):
    import pyautogui
    pyautogui.FAILSAFE = False
    pyautogui.click(button=button)
    return {"status": f"Clicked {button} mouse button"}

def mouse_drag(x, y, button="left"):
    import pyautogui
    pyautogui.FAILSAFE = False
    pyautogui.dragTo(int(x), int(y), duration=0.5, button=button)
    return {"status": f"Dragged {button} mouse to {x}, {y}"}

def keyboard_type(text):
    import pyautogui
    pyautogui.FAILSAFE = False
    # Pyautogui typewrite types keys one by one
    pyautogui.typewrite(text, interval=0.01)
    return {"status": f"Typed text: {text}"}

def keyboard_press(key):
    import pyautogui
    pyautogui.FAILSAFE = False
    if isinstance(key, list):
        pyautogui.hotkey(*key)
        return {"status": f"Pressed keys: {'+'.join(key)}"}
    else:
        pyautogui.press(key)
        return {"status": f"Pressed key: {key}"}

def take_snapshot():
    import pyautogui
    import base64
    from io import BytesIO
    pyautogui.FAILSAFE = False
    img = pyautogui.screenshot()
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
    return {"snapshot": img_str}

def get_screen_elements():
    import sys
    # This must be set before pywinauto/comtypes is imported to avoid threading issues
    if not hasattr(sys, 'coinit_flags'):
        sys.coinit_flags = 2
    import pywinauto
    from pywinauto import Desktop
    import win32gui
    import time

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
    start_time = time.time()
    
    def traverse(ctrl, depth=0):
        # Prevent taking forever on complex UIs like browsers
        if time.time() - start_time > 15.0:
            return
        if depth > 15:
            return
            
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
                traverse(child, depth + 1)
        except Exception:
            pass
            
    traverse(window)
    return {"elements": elements}

def lock_pc():
    import os
    os.system("rundll32.exe user32.dll,LockWorkStation")
    return {"status": "PC Locked"}

def start_dictation():
    import pyautogui
    pyautogui.FAILSAFE = False
    pyautogui.hotkey('win', 'h')
    return {"status": "Dictation started"}

def media_control(action):
    import pyautogui
    pyautogui.FAILSAFE = False
    pyautogui.press(action)
    return {"status": f"Media action {action} executed"}

def read_selected_text():
    import pyautogui
    import subprocess
    import time
    pyautogui.FAILSAFE = False
    pyautogui.hotkey('ctrl', 'c')
    time.sleep(0.2)
    # Use powershell to read clipboard to avoid extra python dependencies
    result = subprocess.run(['powershell', '-command', 'Get-Clipboard'], capture_output=True, text=True)
    return {"text": result.stdout.strip()}

if __name__ == "__main__":
    try:
        input_data = sys.stdin.read()
        if not input_data:
            print(json.dumps({"error": "No input provided"}))
            sys.stdout.flush()
            os._exit(1)
            
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
        elif action == "take_snapshot":
            result = take_snapshot()
        elif action == "get_screen_elements":
            result = get_screen_elements()
        elif action == "lock_pc":
            result = lock_pc()
        elif action == "start_dictation":
            result = start_dictation()
        elif action == "media_control":
            result = media_control(req.get("media_action"))
        elif action == "read_selected_text":
            result = read_selected_text()
        elif action == "sandbox_automation":
            actions = req.get("actions", [])
            log = []
            
            # Fetch UI tree for validation
            ui_tree_result = get_screen_elements()
            elements = ui_tree_result.get("elements", [])
            
            for act in actions:
                t = act.get("type")
                if t == "mouse_click":
                    x = act.get("x", 0)
                    y = act.get("y", 0)
                    
                    # Verify bounds
                    valid = False
                    for el in elements:
                        rect = el.get("rect", {})
                        if rect.get("left", 0) <= x <= rect.get("right", 0) and rect.get("top", 0) <= y <= rect.get("bottom", 0):
                            valid = True
                            log.append(f"Validated click at ({x}, {y}) on element: {el.get('title')}")
                            break
                    if not valid:
                        result = {"error": f"Sandbox failed: Click at ({x}, {y}) does not hit any valid UI element in the UIA tree."}
                        print(json.dumps(result))
                        sys.stdout.flush()
                        os._exit(1)
                else:
                    log.append(f"Simulated {t} with args {act}")
            
            result = {"status": "Sandbox validation passed.", "simulation_log": log}
        else:
            result = {"error": f"Unknown action: {action}"}
            
        print(json.dumps(result))
        sys.stdout.flush()
        os._exit(0)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.stdout.flush()
        os._exit(1)
