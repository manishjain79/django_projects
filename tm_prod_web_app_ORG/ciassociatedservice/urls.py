from django.urls import path, reverse
from django.conf import settings

if settings.DEBUG:
    from .views.local import views
else:
    from .views.prod import views


app_name = "ciassocatedservice"

urlpatterns = [
    path('', views.home, name='ciassociatedservice-home' ),
    path('associatedservice/gclist/', views.gclist, name='gclist'),
    path('associatedservice/gclist/<str:gcname>/', views.assetlist, name='assetlist'),
    path('cmdb/gclist/', views.gclist, name='gclist_cmdb'),
    path('cmdb/gclist/<str:gcname>/', views.assetlist, name='assetlist_cmdb')
]