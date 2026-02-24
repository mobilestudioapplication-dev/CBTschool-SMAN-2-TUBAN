
import { v4 as uuidv4 } from 'uuid';

/**
 * Mendapatkan ID Unik Perangkat (Browser Instance).
 * ID ini akan disimpan di localStorage dan bertahan selama browser cache tidak dihapus.
 */
export const getDeviceId = (): string => {
  const STORAGE_KEY = 'cbt_device_fingerprint';
  let deviceId = localStorage.getItem(STORAGE_KEY);

  if (!deviceId) {
    deviceId = uuidv4();
    localStorage.setItem(STORAGE_KEY, deviceId);
  }

  return deviceId;
};

/**
 * Mendapatkan Metadata Perangkat sederhana
 */
export const getDeviceInfo = (): any => {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    screen: `${window.screen.width}x${window.screen.height}`,
    language: navigator.language,
    time: new Date().toISOString()
  };
};
