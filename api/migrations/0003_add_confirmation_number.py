# Generated manually for adding confirmation_number to SymptomSession

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0002_symptomsession_medicationprofile"),
    ]

    operations = [
        migrations.AddField(
            model_name="symptomsession",
            name="confirmation_number",
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
    ]