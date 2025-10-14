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

    getServiceCenterId(): string {
        return this.adminData?.serviceCenterId || this.adminData?.id || null;
    }

    getAdminEmail(): string | null {
        return this.adminData?.email || null;
    }

    getServiceCenterName(): string {
        return this.adminData?.serviceCenterName;
    }

    getAdminName(): string {
        return this.adminData?.name || '';
    }
    
    getRole(): string | null {
        return this.adminData?.role || null;
    }

    isLoggedIn(): boolean {
        return !!this.adminData;
    }

    logout() {
        this.adminData = null;
        sessionStorage.removeItem('serviceCenterAdmin');
    }
}
