import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthService {
    private adminData: any = null;

    setAdmin(data: any) {
        this.adminData = data;
        localStorage.setItem('serviceCenterAdmin', JSON.stringify(data));
    }

    getAdmin() {
        if (!this.adminData) {
            const stored = localStorage.getItem('serviceCenterAdmin');
            if (stored) {
                this.adminData = JSON.parse(stored);
            }
        }
        return this.adminData;
    }

    getEmail(): string | null {
        return this.getAdmin()?.email || null;
    }

    getWorkshopName(): string | null {
        return this.getAdmin()?.workshopName || null;
    }

    isLoggedIn(): boolean {
        return !!this.getAdmin();
    }

    logout() {
        this.adminData = null;
        localStorage.removeItem('serviceCenterAdmin');
    }
}
