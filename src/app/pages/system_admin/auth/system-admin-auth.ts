import { Injectable } from '@angular/core';
import { SystemAdminContextService } from './system-admin-context';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private adminData: any = null;

  constructor(private context: SystemAdminContextService) { }

  setAdmin(data: any) {
    this.adminData = data;
    sessionStorage.setItem('systemAdmin', JSON.stringify(data));
  }

  getAdmin() {
    if (!this.adminData) {
      const stored = sessionStorage.getItem('systemAdmin');
      if (stored) {
        this.adminData = JSON.parse(stored);
      }
    }
    return this.adminData;
  }

  isLoggedIn(): boolean {
    return !!this.adminData;
  }

  logout() {
     this.adminData = null;
    sessionStorage.removeItem('systemAdmin');
  }

  getAdminId() {
    return this.adminData?.id || null;
  }

  getAdminName() {
    return this.getAdmin()?.name || null;
  }
}