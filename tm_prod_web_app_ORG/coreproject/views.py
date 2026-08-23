from django.shortcuts import HttpResponse

def test(request):
    return HttpResponse('<a href="https://associatedservices-bxgha5fabuaefwhf.southeastasia-01.azurewebsites.net/tm_assets_and_ntt_services/">Click Here</a>')