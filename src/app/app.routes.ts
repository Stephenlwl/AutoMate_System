import { Routes } from '@angular/router';
import { SystemAdminAuthGuard } from './pages/system_admin/auth/system-admin-auth-guard';
import { LoginComponent } from './pages/system_admin/system-admin-login/system-admin-login.component';
import { SignupComponent } from './pages/system_admin/system-admin-signup/system-admin-signup.component';
import { DashboardComponent } from './pages/system_admin/dashboard/dashboard.component';
import { LayoutComponent } from './pages/system_admin/layout/layout.component';
import { ValidateUserAccountsComponent } from './pages/system_admin/validate-user-accounts/validate-user-accounts.component';
import { ValidateServiceCenterAdminComponent } from './pages/system_admin/validate-service-center-admin/validate-service-center-admin.component';
import { VerifyVehiclesComponent } from './pages/system_admin/verify-vehicles/verify-vehicles.component';
import { ManageReviewComponent } from './pages/system_admin/manage-review/manage-review.component';
import { ManageServicesComponent } from './pages/system_admin/manage-services/manage-services.component';
import { ManageTowingServicesComponent } from './pages/system_admin/manage-towing-services/manage-towing-services.component';
import { ManageVehiclesListComponent } from './pages/system_admin/manage-vehicles-list/manage-vehicles-list.component';
import { ManageChatComponent } from './pages/system_admin/manage-chat/manage-chat.component';
import { ServiceCenterLoginComponent } from './pages/service_center/service-center-login/service-center-login.component';
import { ServiceCenterSignupComponent } from './pages/service_center/service-center-signup/service-center-signup.component';

import { ServiceCenterAuthGuard } from './pages/service_center/auth/service-center-auth-guard';
import { ServiceCenterLayoutComponent } from './pages/service_center/layout/layout.component';
import { ServiceCenterDashboardComponent } from './pages/service_center/dashboard/dashboard.component';
import { ManageServiceBookingsComponent } from './pages/service_center/manage-service-bookings/manage-service-bookings.component';
import { ManageTowingBookingsComponent } from './pages/service_center/manage-towing-bookings/manage-towing-bookings.component';
import { ManageBaysComponent } from './pages/service_center/manage-bays/manage-bays.component';
import { ServiceCenterServiceComponent } from './pages/service_center/manage-services/manage-services.component';
import { ServiceCenterTowingServicesComponent } from './pages/service_center/manage-towing-services/manage-towing-services.component';
import { ServiceCenterChatComponent } from './pages/service_center/chat-support/chat-support.component';
import { ServiceCenterDetailsComponent } from './pages/service_center/service-center-details/service-center-details.component';
import { ServiceCenterProfileComponent } from './pages/service_center/profile/profile.component';
import { ManageStaffTowingDriverComponent } from './pages/service_center/manage-staff-towing-driver/manage-staff-towing-driver.component';
import { ServiceInvoiceComponent } from './pages/service_center/service-invoice/service-invoice.component';
import { ServicePaymentComponent } from './pages/service_center/service-payment/service-payment.component';
import { TowingInvoiceComponent } from './pages/service_center/towing-invoice/towing-invoice.component';
import { TowingPaymentComponent } from './pages/service_center/towing-payment/towing-payment.component';

export const routes: Routes = [
  { path: 'systemAdmin/login', component: LoginComponent },
  { path: 'systemAdmin/signup', component: SignupComponent },
  { path: 'serviceCenter/login', component: ServiceCenterLoginComponent },
  { path: 'serviceCenter/signup', component: ServiceCenterSignupComponent },

  {
    path: 'systemAdmin',
    component: LayoutComponent,
    canActivate: [SystemAdminAuthGuard],
    children: [
      { path: 'dashboard', component: DashboardComponent },
      { path: 'validate-user-accounts', component: ValidateUserAccountsComponent },
      { path: 'validate-service-center-admin', component: ValidateServiceCenterAdminComponent },
      { path: 'verify-vehicles', component: VerifyVehiclesComponent },
      { path: 'manage-review', component: ManageReviewComponent },
      { path: 'manage-services', component: ManageServicesComponent },
      { path: 'manage-towing-services', component: ManageTowingServicesComponent },
      { path: 'manage-vehicles-list', component: ManageVehiclesListComponent },
      { path: 'manage-chat', component: ManageChatComponent },
    ]
  },

  {
    path: 'serviceCenter',
    component: ServiceCenterLayoutComponent,
    canActivate: [ServiceCenterAuthGuard],
    children: [
      { path: 'dashboard', component: ServiceCenterDashboardComponent },
      { path: 'manage-service-bookings', component: ManageServiceBookingsComponent },
      { path: 'manage-bays', component: ManageBaysComponent },
      { path: 'manage-services', component: ServiceCenterServiceComponent },
      { path: 'manage-towing-bookings', component: ManageTowingBookingsComponent },
      { path: 'manage-towing-services', component: ServiceCenterTowingServicesComponent },
      { path: 'chat-support', component: ServiceCenterChatComponent },
      { path: 'service-center-details', component: ServiceCenterDetailsComponent },
      { path: 'profile', component: ServiceCenterProfileComponent },
      { path: 'manage-staff-towing-driver', component: ManageStaffTowingDriverComponent },
      { path: 'manage-service-bookings', component: ManageServiceBookingsComponent },
    ]
  },
  { path: 'service-invoice/booking/:bookingId/:adminName', component: ServiceInvoiceComponent },
  { path: 'service-invoice/:invoiceId/:adminName', component: ServiceInvoiceComponent },
  { path: 'service-payment/:id/:adminName', component: ServicePaymentComponent },
  { path: 'towing-invoice/towing-request/:requestId/:adminName', component: TowingInvoiceComponent },
  { path: 'towing-invoice/:invoiceId/:adminName', component: TowingInvoiceComponent },
  { path: 'towing-payment/:id/:adminName', component: TowingPaymentComponent },
  { path: '', redirectTo: 'systemAdmin/login', pathMatch: 'full' },
  { path: '**', redirectTo: 'systemAdmin/login' }
];
