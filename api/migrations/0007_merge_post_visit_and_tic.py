# Merge migration: parallel 0006 branches (post_visit_diagnosis vs insurer network TIC).

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0006_insurer_network_tic"),
        ("api", "0006_symptomsession_post_visit_diagnosis"),
    ]

    operations = []
