from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0002_symptomsession_medicationprofile"),
    ]

    operations = [
        migrations.AddField(
            model_name="symptomsession",
            name="updated_at",
            field=models.DateTimeField(auto_now=True),
        ),
    ]
