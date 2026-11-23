#!/usr/bin/env python3
"""Mirror a local folder to an FTP host (creates subdirs). Useful for migrating
the SPS site to InfinityFree or any FTP-based host.

Usage:
  python3 scripts/ftp-mirror.py --host ftp.example.com --user u --pass p \
      --local ./site --remote /public_html [--dry-run]
"""
import argparse, os, ftplib

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--host', required=True)
    ap.add_argument('--user', required=True)
    ap.add_argument('--pass', dest='password', required=True)
    ap.add_argument('--local', required=True)
    ap.add_argument('--remote', default='/')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    ftp = ftplib.FTP(args.host)
    ftp.login(args.user, args.password)
    print('Connected. Remote cwd:', ftp.pwd())

    def ensure_dir(path):
        parts = [p for p in path.split('/') if p]
        cur = ''
        for p in parts:
            cur += '/' + p
            try:
                ftp.cwd(cur)
            except ftplib.error_perm:
                try:
                    ftp.mkd(cur)
                    print('MKD', cur)
                except ftplib.error_perm as e:
                    if 'exists' not in str(e).lower():
                        raise

    def upload_dir(local_dir, remote_dir):
        ensure_dir(remote_dir)
        ftp.cwd(remote_dir)
        for name in sorted(os.listdir(local_dir)):
            lpath = os.path.join(local_dir, name)
            rpath = remote_dir.rstrip('/') + '/' + name
            if os.path.isdir(lpath):
                upload_dir(lpath, rpath)
            else:
                if args.dry_run:
                    print('PUT (dry)', lpath, '->', rpath)
                    continue
                with open(lpath, 'rb') as f:
                    ftp.storbinary('STOR ' + name, f)
                print('PUT', lpath, '->', rpath)
        ftp.cwd('..')

    upload_dir(args.local, args.remote)
    ftp.quit()
    print('Done.')

if __name__ == '__main__':
    main()