/**
 * SimVentory — Remote Backup Storage Manager
 * Handles testing, uploading, and pruning backup snapshots to remote FTP, SFTP, and SMB (Samba/NAS) servers.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Test connection and write permissions to a remote FTP, SFTP, or SMB server.
 * @param {Object} config
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function testRemoteStorage(config) {
  const protocol = (config.protocol || '').toLowerCase();
  if (!protocol || protocol === 'none') {
    throw new Error('No remote protocol selected.');
  }

  const host = (config.host || '').trim();
  if (!host) throw new Error('Remote host / IP is required.');

  const username = (config.username || '').trim();
  const password = config.password || '';

  if (protocol === 'ftp') {
    return await testFTP(config);
  } else if (protocol === 'sftp') {
    return await testSFTP(config);
  } else if (protocol === 'smb') {
    return await testSMB(config);
  } else {
    throw new Error(`Unsupported protocol: ${protocol}. Supported: ftp, sftp, smb`);
  }
}

/**
 * Upload a local backup snapshot file to the configured remote server and prune old files.
 * @param {Object} config
 * @param {string} localFilePath
 * @param {string} remoteFileName
 * @param {number} maxKeep
 */
export async function uploadToRemoteStorage(config, localFilePath, remoteFileName, maxKeep = 7) {
  const protocol = (config.protocol || '').toLowerCase();
  if (!protocol || protocol === 'none') return;

  if (protocol === 'ftp') {
    await uploadFTP(config, localFilePath, remoteFileName);
    if (maxKeep > 0) await pruneFTP(config, maxKeep);
  } else if (protocol === 'sftp') {
    await uploadSFTP(config, localFilePath, remoteFileName);
    if (maxKeep > 0) await pruneSFTP(config, maxKeep);
  } else if (protocol === 'smb') {
    await uploadSMB(config, localFilePath, remoteFileName);
    if (maxKeep > 0) await pruneSMB(config, maxKeep);
  }
}

// ==========================================
// 1. FTP / FTPS Implementation (basic-ftp)
// ==========================================
async function getFTPClient() {
  const { Client } = await import('basic-ftp');
  return new Client();
}

async function testFTP(config) {
  const client = await getFTPClient();
  client.ftp.verbose = false;
  client.ftp.timeout = 10000;

  try {
    await client.access({
      host: config.host.trim(),
      port: Number(config.port) || 21,
      user: config.username?.trim(),
      password: config.password || '',
      secure: config.secure === true || config.secure === 'true',
      secureOptions: { rejectUnauthorized: false },
    });

    const remoteDir = (config.remotePath || '').trim();
    if (remoteDir && remoteDir !== '/' && remoteDir !== '.') {
      await client.ensureDir(remoteDir);
    }

    // Write a tiny probe file to test write permissions
    const probeName = `.simventory-probe-${Date.now()}.tmp`;
    const tempBuffer = Buffer.from('simventory connection test');
    const stream = (await import('node:stream')).Readable.from(tempBuffer);
    await client.uploadFrom(stream, probeName);
    await client.remove(probeName).catch(() => {});

    return {
      success: true,
      message: `✓ Successfully connected to FTP server at ${config.host} and verified write permissions!`,
    };
  } finally {
    client.close();
  }
}

async function uploadFTP(config, localFilePath, remoteFileName) {
  const client = await getFTPClient();
  client.ftp.verbose = false;
  client.ftp.timeout = 30000;

  try {
    await client.access({
      host: config.host.trim(),
      port: Number(config.port) || 21,
      user: config.username?.trim(),
      password: config.password || '',
      secure: config.secure === true || config.secure === 'true',
      secureOptions: { rejectUnauthorized: false },
    });

    const remoteDir = (config.remotePath || '').trim();
    if (remoteDir && remoteDir !== '/' && remoteDir !== '.') {
      await client.ensureDir(remoteDir);
    }

    await client.uploadFrom(localFilePath, remoteFileName);
  } finally {
    client.close();
  }
}

async function pruneFTP(config, maxKeep = 7) {
  const client = await getFTPClient();
  client.ftp.verbose = false;
  try {
    await client.access({
      host: config.host.trim(),
      port: Number(config.port) || 21,
      user: config.username?.trim(),
      password: config.password || '',
      secure: config.secure === true || config.secure === 'true',
      secureOptions: { rejectUnauthorized: false },
    });

    const remoteDir = (config.remotePath || '').trim();
    if (remoteDir && remoteDir !== '/' && remoteDir !== '.') {
      await client.cd(remoteDir);
    }

    const list = await client.list();
    const backupFiles = list
      .filter(f => f.name.startsWith('simventory-backup-') && f.name.endsWith('.json'))
      .sort((a, b) => b.name.localeCompare(a.name)); // ISO timestamp sorts lexicographically

    if (backupFiles.length > maxKeep) {
      const toDelete = backupFiles.slice(maxKeep);
      for (const f of toDelete) {
        try {
          await client.remove(f.name);
          console.log(`[Remote Backup FTP] Pruned old snapshot: ${f.name}`);
        } catch (_) {}
      }
    }
  } catch (err) {
    console.warn('[Remote Backup FTP] Prune warning:', err.message);
  } finally {
    client.close();
  }
}

// ==========================================
// 2. SFTP Implementation (ssh2-sftp-client)
// ==========================================
async function getSFTPClient() {
  const module = await import('ssh2-sftp-client');
  const SftpClient = module.default || module;
  return new SftpClient();
}

async function testSFTP(config) {
  const sftp = await getSFTPClient();
  try {
    const connectConfig = {
      host: config.host.trim(),
      port: Number(config.port) || 22,
      username: config.username?.trim(),
      readyTimeout: 10000,
    };
    if (config.privateKey && config.privateKey.trim()) {
      connectConfig.privateKey = config.privateKey.trim();
    } else if (config.password) {
      connectConfig.password = config.password;
    }

    await sftp.connect(connectConfig);
    const targetDir = (config.remotePath || '').trim() || '.';
    const exists = await sftp.exists(targetDir);
    if (!exists) {
      await sftp.mkdir(targetDir, true);
    }

    const probeName = `.simventory-probe-${Date.now()}.tmp`;
    const remoteProbePath = `${targetDir.replace(/\/+$/, '')}/${probeName}`;
    await sftp.put(Buffer.from('simventory probe'), remoteProbePath);
    await sftp.delete(remoteProbePath).catch(() => {});

    return {
      success: true,
      message: `✓ Successfully connected to SFTP server at ${config.host} and verified write permissions!`,
    };
  } finally {
    await sftp.end().catch(() => {});
  }
}

async function uploadSFTP(config, localFilePath, remoteFileName) {
  const sftp = await getSFTPClient();
  try {
    const connectConfig = {
      host: config.host.trim(),
      port: Number(config.port) || 22,
      username: config.username?.trim(),
      readyTimeout: 20000,
    };
    if (config.privateKey && config.privateKey.trim()) {
      connectConfig.privateKey = config.privateKey.trim();
    } else if (config.password) {
      connectConfig.password = config.password;
    }

    await sftp.connect(connectConfig);
    const targetDir = (config.remotePath || '').trim() || '.';
    const exists = await sftp.exists(targetDir);
    if (!exists) {
      await sftp.mkdir(targetDir, true);
    }

    const remotePath = `${targetDir.replace(/\/+$/, '')}/${remoteFileName}`;
    await sftp.fastPut(localFilePath, remotePath);
  } finally {
    await sftp.end().catch(() => {});
  }
}

async function pruneSFTP(config, maxKeep = 7) {
  const sftp = await getSFTPClient();
  try {
    const connectConfig = {
      host: config.host.trim(),
      port: Number(config.port) || 22,
      username: config.username?.trim(),
    };
    if (config.privateKey && config.privateKey.trim()) {
      connectConfig.privateKey = config.privateKey.trim();
    } else if (config.password) {
      connectConfig.password = config.password;
    }

    await sftp.connect(connectConfig);
    const targetDir = (config.remotePath || '').trim() || '.';
    const list = await sftp.list(targetDir);
    const backupFiles = list
      .filter(f => f.name.startsWith('simventory-backup-') && f.name.endsWith('.json'))
      .sort((a, b) => b.name.localeCompare(a.name));

    if (backupFiles.length > maxKeep) {
      const toDelete = backupFiles.slice(maxKeep);
      for (const f of toDelete) {
        try {
          await sftp.delete(`${targetDir.replace(/\/+$/, '')}/${f.name}`);
          console.log(`[Remote Backup SFTP] Pruned old snapshot: ${f.name}`);
        } catch (_) {}
      }
    }
  } catch (err) {
    console.warn('[Remote Backup SFTP] Prune warning:', err.message);
  } finally {
    await sftp.end().catch(() => {});
  }
}

// ==========================================
// 3. SMB / Samba / Windows Share (@marsaud/smb2)
// ==========================================
async function getSMBClient(config) {
  const module = await import('@marsaud/smb2');
  const SMB2 = module.default || module;

  // Extract share name from host or remotePath if formatted as \\host\share\path or just share
  let rawShare = (config.remotePath || '').trim();
  let subDir = '';

  if (rawShare.includes('/') || rawShare.includes('\\')) {
    const parts = rawShare.replace(/^[\\\/]+|[\\\/]+$/g, '').split(/[\\\/]/);
    rawShare = parts[0];
    subDir = parts.slice(1).join('\\');
  } else if (!rawShare) {
    rawShare = 'backups';
  }

  const sharePath = `\\\\${config.host.trim()}\\${rawShare}`;
  const client = new SMB2({
    share: sharePath,
    domain: config.domain?.trim() || 'WORKGROUP',
    username: config.username?.trim() || '',
    password: config.password || '',
    autoCloseTimeout: 10000,
  });

  return { client, subDir, sharePath };
}

async function testSMB(config) {
  const { client, subDir, sharePath } = await getSMBClient(config);

  return new Promise((resolve, reject) => {
    const probeName = `.simventory-probe-${Date.now()}.tmp`;
    const targetPath = subDir ? `${subDir}\\${probeName}` : probeName;

    const doProbe = () => {
      client.writeFile(targetPath, Buffer.from('simventory smb probe'), (writeErr) => {
        if (writeErr) {
          client.disconnect();
          return reject(new Error(`SMB write failed on share ${sharePath}: ${writeErr.message}`));
        }
        client.unlink(targetPath, () => {
          client.disconnect();
          resolve({
            success: true,
            message: `✓ Successfully connected to SMB share ${sharePath} and verified write permissions!`,
          });
        });
      });
    };

    if (subDir) {
      client.ensureDir(subDir, (dirErr) => {
        if (dirErr) {
          client.disconnect();
          return reject(new Error(`Failed to access directory ${subDir} on share ${sharePath}: ${dirErr.message}`));
        }
        doProbe();
      });
    } else {
      doProbe();
    }
  });
}

async function uploadSMB(config, localFilePath, remoteFileName) {
  const { client, subDir } = await getSMBClient(config);
  const fileBuffer = fs.readFileSync(localFilePath);
  const targetPath = subDir ? `${subDir}\\${remoteFileName}` : remoteFileName;

  return new Promise((resolve, reject) => {
    const doWrite = () => {
      client.writeFile(targetPath, fileBuffer, (err) => {
        client.disconnect();
        if (err) return reject(err);
        resolve();
      });
    };

    if (subDir) {
      client.ensureDir(subDir, (err) => {
        if (err) {
          client.disconnect();
          return reject(err);
        }
        doWrite();
      });
    } else {
      doWrite();
    }
  });
}

async function pruneSMB(config, maxKeep = 7) {
  const { client, subDir } = await getSMBClient(config);

  return new Promise((resolve) => {
    client.readdir(subDir || '', (err, files) => {
      if (err || !Array.isArray(files)) {
        client.disconnect();
        return resolve();
      }

      const backupFiles = files
        .filter(f => f.startsWith('simventory-backup-') && f.endsWith('.json'))
        .sort((a, b) => b.localeCompare(a));

      if (backupFiles.length > maxKeep) {
        const toDelete = backupFiles.slice(maxKeep);
        let pending = toDelete.length;
        if (pending === 0) {
          client.disconnect();
          return resolve();
        }

        toDelete.forEach(filename => {
          const filePath = subDir ? `${subDir}\\${filename}` : filename;
          client.unlink(filePath, () => {
            pending--;
            if (pending <= 0) {
              client.disconnect();
              resolve();
            }
          });
        });
      } else {
        client.disconnect();
        resolve();
      }
    });
  });
}
