if (navigator.getGamepads) {
    window.addEventListener("gamepadconnected", function(e) {
      console.log("Gamepad connected:", e.gamepad);
      // Add your gamepad logic here
    });
  
    window.addEventListener("gamepaddisconnected", function(e) {
      console.log("Gamepad disconnected:", e.gamepad);
    });
  }

  export function handleGamepadInput(gamepad) {
    // your gamepad logic here
  }