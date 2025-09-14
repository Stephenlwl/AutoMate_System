import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AdminService } from '../auth/system-admin-auth';

@Injectable({ providedIn: 'root' })
export class SystemAdminAuthGuard implements CanActivate {
  constructor(private auth: AdminService, private router: Router) {}

  canActivate(): boolean {
    if (this.auth.isLoggedIn()) {
      return true;
    }
    this.router.navigate(['/systemAdmin/login']);
    return false;
  }
}
