from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0003_user_default_address"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="default_insurance_slug",
            field=models.CharField(blank=True, max_length=32, null=True),
        ),
    ]
