import { Card, CardContent, CardHeader, Button, LinearProgress } from "@mui/material"
import { Box } from "@mui/system"
import { Flasher } from "./Flasher"
import { useFirmwareLoader, useOnewheel } from "@hooks"
import { ConnectionManager } from "../../components/ConnectionManager"
import { useTranslation } from "react-i18next"
import { useEffect, useState } from "react"
import { MAGIC_UNLOCK_5100, START_UPDATE_MESSAGE } from "../../messages"

const uuidBoard = 'e659f300-ea98-11e3-ac10-0800200c9a66'; // Board service
const uuidHwVer = 'e659f318-ea98-11e3-ac10-0800200c9a66'; // Hardware version
const uuidFwVer = 'e659f311-ea98-11e3-ac10-0800200c9a66'; // Firmware version
const uuidError = 'e659f31c-ea98-11e3-ac10-0800200c9a66'; // Last error code
const uuidPerms = 'e659f31f-ea98-11e3-ac10-0800200c9a66'; // Permission bits
const uuidWrite = 'e659f3ff-ea98-11e3-ac10-0800200c9a66'; // Serial writes to board

const chunks = (array, size) => Array.from({ length: Math.ceil(array.length / size) }, (_, i) => array.slice(i * size, i * size + size));
const delayMs = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const FlasherPage = () => {
  const { t } = useTranslation(["flasher", "common"])
  const { firmware, showFirmwareInput } = useFirmwareLoader()

  const onewheel = useOnewheel()
  const [is5100, setIs5100] = useState(false)
  const [magicUnlockRunning, setMagicUnlockRunning] = useState(false)
  const [magicUnlockSuccess, setMagicUnlockSuccess] = useState(false)

  useEffect(() => {
    if (onewheel.characteristics) {
      onewheel.characteristics.firmwareRevision.readValue().then(value => {
        const fwVer = value.getUint16();
        setIs5100(fwVer == 5100)
      });    
    }
  }, [onewheel])

  const waitForBlVersion = (charError) => Promise.race([
    new Promise((resolve, _) => {
        charError.startNotifications();
        charError.addEventListener('characteristicvaluechanged', (event) => {
            const errorCode = event.target.value.getUint16();
            if (((errorCode >> 8) & 0xFF) === 32) {
                resolve(errorCode & 0xFF);
            }
        });
    }),
    new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timed out waiting for bootloader version. Try again.')), 7500);
    }),
  ]); 

  async function magicUnlock() {
    setMagicUnlockRunning(true)

    try {
      const service = await onewheel.device.gatt.getPrimaryService(uuidBoard);
      const charArr = await service.getCharacteristics();

      const charHwVer = charArr.find(c => c.uuid === uuidHwVer);
      const charFwVer = charArr.find(c => c.uuid === uuidFwVer);
      const charPerms = charArr.find(c => c.uuid === uuidPerms);
      const charWrite = charArr.find(c => c.uuid === uuidWrite);
      const charError = charArr.find(c => c.uuid === uuidError);

      const blSupported = {
        [true /*  Pint   */]: { 6: true },
        [false /* Pint X */]: { 7: true },
      };

      if (!charHwVer || !charFwVer || !charPerms || !charWrite || !charError) {
          let log = "Missing characteristic(s): ";
          if (!charHwVer) log += "HwVersion ";
          if (!charFwVer) log += "FwVersion ";
          if (!charPerms) log += "Permissions ";
          if (!charWrite) log += "SerialWrite ";
          if (!charError) log += "ErrorCode ";
          throw new Error(log);
      }

      const hwVer = (await charHwVer.readValue()).getUint16();
      if (5325 <= hwVer && hwVer < 6000) {
          alert('Your board is HW:5325+ or newer. All attempts to flash HW:5325+ have so far failed and bricked!');
      }

      const fwVer = (await charFwVer.readValue()).getUint16();

      if (fwVer < 5000 || fwVer >= 6000)
          throw new Error('This tool only works with Pint / Pint X boards.');
      if (fwVer < 5100)
          throw new Error('Firmware older than 5100 do not need magic.');
      if (fwVer > 5100)
          throw new Error('Firmware newer than 5100 has not been tested.');

      for (const chunk of chunks(MAGIC_UNLOCK_5100, 20)) {
          await charWrite.writeValueWithResponse(chunk);
      }

      let unlocked = false;
      for (let i = 0; i < 30; i++) {
          if (((await charPerms.readValue()).getUint16() & 4) != 0) {
              unlocked = true;
              break;
          }
          await delayMs(100);
      }

      if (!unlocked)
          throw new Error('Failed? Restart the board and try again.');

      const blVer = await waitForBlVersion(charError);

      const isPint = 5000 <= hwVer && hwVer < 6000;
      const seenBl = blSupported[isPint][blVer];

      if (seenBl === undefined) {
          alert(`Unexpected bootloader version for a ${isPint ? 'Pint' : 'Pint X'}. 
            If you continue anyway you might brick your board. You have been warned!`); 
      }

      if (seenBl === false) {
          alert(`Your bootloader is known to be incompatible. If you continue anyway you will most likely brick your board.`);
      }

      await charWrite.writeValueWithResponse(START_UPDATE_MESSAGE)

      setMagicUnlockSuccess(true)
      alert("Your board has been put into FW Update mode! Restart your board and then refresh this page and you will be able to flash!")
    } catch (e) {
      alert('Failed to unlock board: ' + e);
    } finally {
      setMagicUnlockRunning(false)
    }
  }

  return (
    <ConnectionManager title={t("title")} subheader={t("subheader")}>
      <Box sx={{ my: 1 }}>
        <Card>
          <CardHeader title={t("selectFirmware.title", { ns: "common" })} />
          <CardContent>{showFirmwareInput()}</CardContent>
        </Card>


        {firmware && (
          <Card sx={{ my: 1 }}>
            <CardHeader title={t("title")} />
            <CardContent>
              
              {is5100 && (
                <>
                  <Button
                    onClick={() => magicUnlock()}
                    variant="outlined"
                    disabled={magicUnlockRunning || magicUnlockSuccess}
                    sx={{ my: 1 }}
                  >
                      {magicUnlockSuccess ? t("unlockSuccess") : t("unlock5100")}
                  </Button>

                  {magicUnlockRunning && (
                    <LinearProgress sx={{ my: 1 }} />
                  )}
                </>
              )}
              <Flasher firmware={firmware ?? selectedFirmware} />
            </CardContent>
          </Card>
        )}
      </Box>
    </ConnectionManager>
  )
}
