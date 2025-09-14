import { Injectable } from '@angular/core';
import { ServiceCenterContextService } from './service-center-context';


@Injectable({ providedIn: 'root' })
export class AuthService {
    private adminData: any = null;

    constructor(private context: ServiceCenterContextService) {}

    setAdmin(data: any) {
        this.adminData = data;
        sessionStorage.setItem('serviceCenterAdmin', JSON.stringify(data));
    }

    getAdmin() {
        if (!this.adminData) {
            const stored = sessionStorage.getItem('serviceCenterAdmin');
            if (stored) {
                this.adminData = JSON.parse(stored);
            }
        }
        return this.adminData;
    }

    getEmail(): string | null {
        return this.adminData?.email || null;
    }

    getServiceCenterName(): string | null {
        return this.adminData?.serviceCenterName || null;
    }

    isLoggedIn(): boolean {
        return !!this.adminData;
    }

    logout() {
        this.adminData = null;
        sessionStorage.removeItem('serviceCenterAdmin');
    }
}
